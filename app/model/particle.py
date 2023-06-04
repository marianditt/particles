import math
from typing import List

from app.model.stream import Stream


class Particle(object):
    @staticmethod
    def zero() -> 'Particle':
        return Particle(0.0, 0.0)

    @staticmethod
    def ex() -> 'Particle':
        return Particle(1.0, 0.0)

    @staticmethod
    def ey() -> 'Particle':
        return Particle(0.0, 1.0)

    @staticmethod
    def from_stream(stream: Stream[float]) -> 'Particle':
        r = stream.read()
        phi = stream.read()
        return Particle(r * math.cos(phi), r * math.sin(phi))

    def __init__(self, x: float, y: float) -> None:
        self.__x = x
        self.__y = y

    @property
    def x(self) -> float:
        return self.__x

    @property
    def y(self) -> float:
        return self.__y

    def dot(self, other: 'Particle') -> float:
        return self.__x * other.__x + self.__y * other.__y

    def to_array(self) -> List[float]:
        r = math.sqrt(self.dot(self))
        phi = math.atan2(self.y, self.x)
        return [r, phi]

    def __add__(self, other: 'Particle') -> 'Particle':
        return Particle(self.x + other.x, self.y + other.y)

    def __sub__(self, other: 'Particle') -> 'Particle':
        return self + -other

    def __neg__(self) -> 'Particle':
        return -1.0 * self

    def __mul__(self, factor: float) -> 'Particle':
        return Particle(factor * self.x, factor * self.y)

    def __rmul__(self, factor: float) -> 'Particle':
        return self * factor

    def __truediv__(self, factor: float) -> 'Particle':
        return self * (1.0 / factor)
