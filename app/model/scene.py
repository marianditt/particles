from typing import List

from app.model.cloud import Cloud
from app.model.stream import Stream


class Scene(object):
    @staticmethod
    def from_stream(stream: Stream, particle_radius: float) -> 'Scene':
        light = stream.read()
        cloud = Cloud.from_stream(stream, particle_radius)
        return Scene(cloud, light)

    def __init__(self, cloud: Cloud, light: float) -> None:
        self.__cloud = cloud
        self.__light = light

    @property
    def cloud(self) -> Cloud:
        return self.__cloud

    @property
    def light(self) -> float:
        return self.__light

    def to_array(self) -> List[float]:
        return [self.__light, *self.__cloud.to_array()]
