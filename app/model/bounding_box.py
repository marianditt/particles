from dataclasses import dataclass


@dataclass
class BoundingBox(object):
    min_x: float
    min_y: float
    max_x: float
    max_y: float
