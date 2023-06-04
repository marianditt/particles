from dataclasses import dataclass

from app.config.cloud_config import CloudConfig
from app.config.light_config import LightConfig


@dataclass
class StateFactoryConfig(object):
    std_spread_x: float
    std_spread_y: float
    max_period: float
    cloud: CloudConfig
    light: LightConfig
