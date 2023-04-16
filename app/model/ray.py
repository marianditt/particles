import math
from dataclasses import dataclass

from app.model.vector import Vector


@dataclass
class Ray(object):
    x0: float
    phi: float

    @property
    def direction(self) -> Vector:
        return Vector(math.cos(self.phi), math.sin(self.phi))
