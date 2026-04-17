"""Pydantic models for API request/response schemas."""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    sport_key: str
    checklist_ids: List[str] = []
    master_key: Optional[str] = None


class BreakSimulationRequest(BaseModel):
    sport_key: str
    checklist_ids: List[str] = []
    master_key: Optional[str] = None
    method: str = "team"
    custom_scope: str = "teams"
    custom_map: Optional[Dict[str, str]] = None
    custom_spots: Optional[List[str]] = None
    extracted_players: List[str] = []
    checklist_hits_guaranteed: Optional[Dict[str, int]] = None


class ExportRequest(BaseModel):
    sport_key: str
    checklist_ids: List[str] = []
    master_key: Optional[str] = None
    include_team: bool = True
    include_player: bool = True
    include_cards: bool = True
    include_auto: bool = True
    include_case: bool = True
    include_logoman: bool = False
    include_base: bool = False
    sort_mode: str = "Équipe (A-Z)"
    team_detail: Optional[str] = None  # None = disabled, "" = all teams, "Lakers" = specific


class PresetSaveRequest(BaseModel):
    name: str
    checklist_ids: List[str]


class SimulationPresetSaveRequest(BaseModel):
    name: str
    checklist_ids: List[str]
    method: str
    extracted_players: List[str] = []
    hits_guaranteed: Dict[str, int] = {}
    custom_map: Optional[Dict[str, str]] = None


class SimulationPreset(BaseModel):
    name: str
    checklist_ids: List[str]
    method: str
    extracted_players: List[str]
    hits_guaranteed: Dict[str, int]
    custom_map: Optional[Dict[str, str]] = None


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------

class SportInfo(BaseModel):
    key: str
    label: str
    page_icon: str


class ChecklistInfo(BaseModel):
    checklist_id: str
    checklist_name: str
    year: str
    rows: int


class CardRecord(BaseModel):
    player: str
    team: str
    box_type: str
    numbering: str
    hits: int
    file: str
    year: str
    product: str
    checklist_id: str
    checklist_name: str
    category: str
    rarity_mult: float
    score: float


class RankingRecord(BaseModel):
    name: str = Field(alias="Player|Team")
    hits: int


class CategorySummary(BaseModel):
    logoman: int = 0
    case_hit: int = 0
    auto_mem: int = 0
    base_other: int = 0


class AnalysisMetadata(BaseModel):
    total_rows: int
    unique_teams: int
    unique_players: int
    checklists_count: int
    collapsed_multi_rows: int
    sport_key: str
    sport_label: str


class AnalyzeResponse(BaseModel):
    cards: List[dict]
    player_rankings: List[dict]
    team_rankings: List[dict]
    category_summary: dict
    enabled_views: dict
    metadata: dict


class BreakSimulationResponse(BaseModel):
    spots: List[dict]
    summary: dict
    player_map: Dict[str, List[str]]
    card_details: List[dict] = []


class ExportResponse(BaseModel):
    filename: str
    content_type: str
