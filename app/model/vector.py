from dataclasses import dataclass


@dataclass
class Vector(object):
    x: float
    y: float

    @staticmethod
    def zero() -> 'Vector':
        return Vector(0.0, 0.0)

    @staticmethod
    def ex() -> 'Vector':
        return Vector(1.0, 0.0)

    @staticmethod
    def ey() -> 'Vector':
        return Vector(0.0, 1.0)

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
