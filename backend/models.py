import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from database import Base


class Idea(Base):
    __tablename__ = "ideas"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(100), index=True, nullable=True)
    title = Column(String(255), default="Untitled Idea")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    versions = relationship("IdeaVersion", back_populates="idea", cascade="all, delete-orphan",
                            order_by="IdeaVersion.created_at.desc()")


class IdeaVersion(Base):
    __tablename__ = "idea_versions"

    id = Column(Integer, primary_key=True, index=True)
    idea_id = Column(Integer, ForeignKey("ideas.id", ondelete="CASCADE"), nullable=False)
    parent_version_id = Column(Integer, ForeignKey("idea_versions.id"), nullable=True)
    file_path = Column(String(500), nullable=False)
    duration = Column(Float, nullable=True)
    bpm = Column(Float, nullable=True)
    key_signature = Column(String(10), nullable=True)
    mood = Column(String(100), nullable=True)
    genre = Column(String(100), nullable=True)
    energy_level = Column(String(50), nullable=True)
    instruments = Column(JSON, default=list)
    tags = Column(JSON, default=list)
    notes = Column(Text, nullable=True)
    spectral_centroid = Column(Float, nullable=True)
    zero_crossing_rate = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    idea = relationship("Idea", back_populates="versions")
    parent = relationship("IdeaVersion", remote_side=[id], backref="children")
