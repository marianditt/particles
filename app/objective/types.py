from dataclasses import dataclass
from typing import List, Set

from sympy import Symbol, Matrix

Particle = Matrix
Cloud = List[Particle]


@dataclass
class Ray(object):
    x0: Symbol
    phi: Symbol

    @property
    def free_symbols(self) -> Set[Symbol]:
        return {self.x0, self.phi}


Light = List[Ray]
