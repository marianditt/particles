from dataclasses import dataclass
from typing import List

from app.model.particle import Particle


@dataclass
class Cloud(object):
    particles: List[Particle]
