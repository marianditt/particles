from typing import List

from app.model.stream import Stream


class Vector(object):
    @staticmethod
    def zero() -> 'Vector':
        return Vector(0.0, 0.0)

    @staticmethod
    def ex() -> 'Vector':
        return Vector(1.0, 0.0)

    @staticmethod
    def ey() -> 'Vector':
        return Vector(0.0, 1.0)

    @staticmethod
    def from_stream(stream: Stream[float]) -> 'Vector':
        return Vector(stream.read(), stream.read())

    def __init__(self, x: float, y: float) -> None:
        self.__x = x
        self.__y = y

    @property
    def x(self) -> float:
        return self.__x

    @property
    def y(self) -> float:
        return self.__y

    def dot(self, other: 'Vector') -> float:
        return self.__x * other.__x + self.__y * other.__y

    def to_array(self) -> List[float]:
        return [self.__x, self.__y]

    def __add__(self, other: 'Vector') -> 'Vector':
        return Vector(self.x + other.x, self.y + other.y)

    def __sub__(self, other: 'Vector') -> 'Vector':
        return self + -other

    def __neg__(self) -> 'Vector':
        return -1.0 * self

    def __mul__(self, factor: float) -> 'Vector':
        return Vector(factor * self.x, factor * self.y)

    def __rmul__(self, factor: float) -> 'Vector':
        return self * factor

    def __truediv__(self, factor: float) -> 'Vector':
        return self * (1.0 / factor)
