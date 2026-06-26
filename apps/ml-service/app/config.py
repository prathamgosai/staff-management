from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "workforceiq"
    db_user: str = "workforceiq_user"
    db_password: str = "change_me"
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: Optional[str] = None
    ml_service_api_key: str = "internal_ml_service_key"
    enable_ml_forecasting: bool = False

    @property
    def db_url(self) -> str:
        return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"

    @property
    def db_url_sync(self) -> str:
        return f"postgresql://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"

    class Config:
        env_file = "../../.env"
        env_file_encoding = "utf-8"


settings = Settings()
