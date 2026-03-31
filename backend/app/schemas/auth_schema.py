"""Schemas for authentication endpoints."""

from pydantic import BaseModel, EmailStr


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""
    github_username: str = ""


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserProfile(BaseModel):
    uid: str
    email: str
    full_name: str
    github_username: str
    role: str
