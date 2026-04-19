import os
import uuid
import datetime
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db, AUDIO_DIR
from models import Idea, IdeaVersion
from services.audio_processing import analyze_audio
from services.ollama_client import analyze_musical_idea

router = APIRouter(prefix="/api", tags=["capture"])


@router.post("/capture")
async def capture_audio(
    audio: UploadFile = File(...),
    title: str = Form(default=""),
    mood: str = Form(default=""),
    x_device_id: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Capture audio from the rolling buffer, analyze, and store."""
    try:
        # Generate unique filename
        timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_id = str(uuid.uuid4())[:8]
        original_name = audio.filename or ""
        extension = os.path.splitext(original_name)[1].lower()
        if extension not in {".wav", ".webm", ".mp3", ".ogg", ".m4a"}:
            extension = ".wav"
        filename = f"capture_{timestamp}_{file_id}{extension}"
        file_path = os.path.join(AUDIO_DIR, filename)

        from supabase import create_client

        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        supabase_client = None
        if supabase_url and supabase_key:
            supabase_client = create_client(supabase_url, supabase_key)

        # Save audio file
        content = await audio.read()
        
        if supabase_client:
            try:
                # Upload to Supabase Storage
                file_path = filename # In DB, we just save the filename
                supabase_client.storage.from_("audio_files").upload(
                    path=filename, 
                    file=content, 
                    file_options={"content-type": audio.content_type}
                )
                
                # We still need a temporary local file for librosa to analyze it
                temp_path = os.path.join(AUDIO_DIR, filename)
                with open(temp_path, "wb") as f:
                    f.write(content)
                audio_features = analyze_audio(temp_path)
                os.remove(temp_path) # Delete it locally since it's on Supabase
            except Exception as e:
                # If Supabase storage upload fails, we need to know exactly why!
                print(f"Supabase Storage Error: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Supabase Storage Error: {str(e)}")
        else:
            # Save locally (fallback)
            file_path = os.path.join(AUDIO_DIR, filename)
            with open(file_path, "wb") as f:
                f.write(content)
            # Analyze audio features with librosa
            audio_features = analyze_audio(file_path)

        # Get AI-powered semantic analysis from Ollama
        ai_analysis = await analyze_musical_idea(audio_features)

        # Create the idea
        idea = Idea(
            title=title if title else ai_analysis.get("title_suggestion", "Untitled Idea"),
            device_id=x_device_id,
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow(),
        )
        db.add(idea)
        await db.flush()

        # Create the first version
        version = IdeaVersion(
            idea_id=idea.id,
            parent_version_id=None,
            file_path=filename,
            duration=audio_features.get("duration"),
            bpm=audio_features.get("bpm"),
            key_signature=audio_features.get("key_signature"),
            mood=mood.strip() if mood.strip() else ai_analysis.get("mood"),
            genre=ai_analysis.get("genre"),
            energy_level=ai_analysis.get("energy_level"),
            instruments=ai_analysis.get("instruments", []),
            tags=ai_analysis.get("tags", []),
            spectral_centroid=audio_features.get("spectral_centroid"),
            zero_crossing_rate=audio_features.get("zero_crossing_rate"),
            created_at=datetime.datetime.utcnow(),
        )
        db.add(version)
        await db.commit()
        await db.refresh(idea)
        await db.refresh(version)

        return {
            "id": idea.id,
            "title": idea.title,
            "version_id": version.id,
            "display_version": f"v{idea.id}",
            "file_path": version.file_path,
            "bpm": version.bpm,
            "key_signature": version.key_signature,
            "mood": version.mood,
            "genre": version.genre,
            "energy_level": version.energy_level,
            "instruments": version.instruments,
            "tags": version.tags,
            "duration": version.duration,
            "created_at": idea.created_at.isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Global Capture Error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Capture Processing Error: {str(e)}")


@router.post("/capture/{idea_id}/branch")
async def branch_idea(
    idea_id: int,
    parent_version_id: int = Form(...),
    audio: UploadFile = File(...),
    notes: str = Form(default=""),
    x_device_id: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Create a new version (branch) from an existing idea version."""
    # Verify idea exists
    query = select(Idea).where(Idea.id == idea_id)
    if x_device_id:
        query = query.where(Idea.device_id == x_device_id)
        
    result = await db.execute(query)
    idea = result.scalar_one_or_none()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found or unauthorized")

    # Verify parent version exists
    result = await db.execute(
        select(IdeaVersion).where(
            IdeaVersion.id == parent_version_id,
            IdeaVersion.idea_id == idea_id,
        )
    )
    parent_version = result.scalar_one_or_none()
    if not parent_version:
        raise HTTPException(status_code=404, detail="Parent version not found")

    # Save new audio file
    timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    file_id = str(uuid.uuid4())[:8]
    original_name = audio.filename or ""
    extension = os.path.splitext(original_name)[1].lower()
    if extension not in {".wav", ".webm", ".mp3", ".ogg", ".m4a"}:
        extension = ".wav"
    filename = f"branch_{timestamp}_{file_id}{extension}"
    file_path = os.path.join(AUDIO_DIR, filename)

    from supabase import create_client

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    supabase_client = None
    if supabase_url and supabase_key:
        supabase_client = create_client(supabase_url, supabase_key)

    content = await audio.read()
    
    if supabase_client:
        try:
            file_path = filename
            supabase_client.storage.from_("audio_files").upload(
                path=filename, 
                file=content, 
                file_options={"content-type": audio.content_type}
            )
            
            temp_path = os.path.join(AUDIO_DIR, filename)
            with open(temp_path, "wb") as f:
                f.write(content)
            audio_features = analyze_audio(temp_path)
            os.remove(temp_path)
        except Exception as e:
            print(f"Supabase Storage Error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Supabase Storage Error: {str(e)}")
    else:
        file_path = os.path.join(AUDIO_DIR, filename)
        with open(file_path, "wb") as f:
            f.write(content)
        audio_features = analyze_audio(file_path)
    ai_analysis = await analyze_musical_idea(audio_features)

    # Create new version
    version = IdeaVersion(
        idea_id=idea_id,
        parent_version_id=parent_version_id,
        file_path=filename,
        duration=audio_features.get("duration"),
        bpm=audio_features.get("bpm"),
        key_signature=audio_features.get("key_signature"),
        mood=ai_analysis.get("mood"),
        genre=ai_analysis.get("genre"),
        energy_level=ai_analysis.get("energy_level"),
        instruments=ai_analysis.get("instruments", []),
        tags=ai_analysis.get("tags", []),
        notes=notes,
        spectral_centroid=audio_features.get("spectral_centroid"),
        zero_crossing_rate=audio_features.get("zero_crossing_rate"),
        created_at=datetime.datetime.utcnow(),
    )
    db.add(version)

    idea.updated_at = datetime.datetime.utcnow()
    await db.commit()
    await db.refresh(version)

    count_result = await db.execute(select(func.count(IdeaVersion.id)).where(IdeaVersion.idea_id == idea_id))
    version_count = count_result.scalar() or 2
    display_version = f"v{idea_id}.{version_count - 1}"

    return {
        "version_id": version.id,
        "display_version": display_version,
        "idea_id": idea_id,
        "parent_version_id": parent_version_id,
        "file_path": version.file_path,
        "bpm": version.bpm,
        "key_signature": version.key_signature,
        "mood": version.mood,
        "genre": version.genre,
        "tags": version.tags,
        "created_at": version.created_at.isoformat(),
    }
