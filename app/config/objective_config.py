from dataclasses import dataclass

from app.config.cloud_config import CloudConfig
from app.config.light_config import LightConfig


@dataclass
class ObjectiveConfig(object):
    min_gap: float
    cloud: CloudConfig
    light: LightConfig
