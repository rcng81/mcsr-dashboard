from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime
from app.db.session import Base

class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, index=True)

    # Permanent ID from MCSR
    uuid = Column(String, unique=True, index=True, nullable=False)

    # Display name (can change)
    username = Column(String, index=True, nullable=False)

    current_elo = Column(Integer)
    peak_elo = Column(Integer)
    twitch_url = Column(String, nullable=True)
    youtube_url = Column(String, nullable=True)
    discord_id = Column(String, nullable=True)
    discord_username = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
