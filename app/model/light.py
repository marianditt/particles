import math
from typing import List

from app.config.light_config import LightConfig
from app.model.stream import Stream


class Light(object):
    @staticmethod
    def from_stream(stream: Stream, config: LightConfig) -> 'Light':
        return Light(stream.read(), config)

    def __init__(self, angle: float, config: LightConfig) -> None:
        self.__rays = [angle + step * math.pi / config.num_rays for step in range(config.num_rays)]

    @property
    def primary_ray(self) -> float:
        return self.__rays[0]

    @property
    def secondary_rays(self) -> List[float]:
        return self.__rays[1:]

    @property
    def rays(self) -> List[float]:
        return self.__rays

    def to_array(self) -> List[float]:
        return [self.__rays[0]]
