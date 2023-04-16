from dataclasses import dataclass

from app.model.vector import Vector


@dataclass
class Particle(object):
    center: Vector
    radius: float
