"""
Serviço de Autenticação
JWT-based authentication com refresh tokens
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
import os

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class TokenData(BaseModel):
    """Token payload"""
    sub: str  # subject (user id)
    exp: datetime
    iat: datetime
    type: str  # "access" or "refresh"


class Token(BaseModel):
    """Token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class UserLogin(BaseModel):
    """Login request"""
    email: str
    password: str


class UserRegister(BaseModel):
    """Register request"""
    email: str
    password: str
    name: str


def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create JWT access token
    
    Args:
        subject: User ID
        expires_delta: Token expiration time
    
    Returns:
        Encoded JWT token
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    now = datetime.now(timezone.utc)
    expire = now + expires_delta
    
    payload = {
        "sub": subject,
        "iat": now,
        "exp": expire,
        "type": "access"
    }
    
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(subject: str) -> str:
    """
    Create JWT refresh token
    
    Args:
        subject: User ID
    
    Returns:
        Encoded JWT token
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    payload = {
        "sub": subject,
        "iat": now,
        "exp": expire,
        "type": "refresh"
    }
    
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_tokens(subject: str) -> Token:
    """
    Create access and refresh tokens
    
    Args:
        subject: User ID
    
    Returns:
        Token object with access and refresh tokens
    """
    access_token = create_access_token(subject)
    refresh_token = create_refresh_token(subject)
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60  # Convert to seconds
    )


def verify_token(token: str, token_type: str = "access") -> Optional[TokenData]:
    """
    Verify JWT token
    
    Args:
        token: JWT token
        token_type: Type of token ("access" or "refresh")
    
    Returns:
        TokenData if valid, None if invalid
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Verify token type
        if payload.get("type") != token_type:
            return None
        
        return TokenData(
            sub=payload.get("sub"),
            exp=datetime.fromtimestamp(payload.get("exp"), tz=timezone.utc),
            iat=datetime.fromtimestamp(payload.get("iat"), tz=timezone.utc),
            type=payload.get("type")
        )
    except JWTError:
        return None


def refresh_access_token(refresh_token: str) -> Optional[Token]:
    """
    Create new access token from refresh token
    
    Args:
        refresh_token: Valid refresh token
    
    Returns:
        New Token object if refresh is valid, None otherwise
    """
    token_data = verify_token(refresh_token, token_type="refresh")
    
    if token_data is None:
        return None
    
    # Create new access token
    new_access_token = create_access_token(token_data.sub)
    
    return Token(
        access_token=new_access_token,
        refresh_token=refresh_token,  # Keep same refresh token
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
