from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from app.db.session import Base
from datetime import datetime

class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)

    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)

    match_uuid = Column(String, index=True, nullable=False)

    won = Column(Boolean, nullable=False)
    is_draw = Column(Boolean, nullable=False, default=False)

    elo_change = Column(Integer, nullable=True)

    duration_seconds = Column(Integer, nullable=True)
    death_count = Column(Integer, nullable=False, default=0)
    match_type = Column(Integer, nullable=True)
    start_overworld = Column(String, nullable=True, index=True)
    bastion_type = Column(String, nullable=True, index=True)

    played_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    player = relationship("Player", backref="matches")
