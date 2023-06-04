from typing import List

from app.config.cloud_config import CloudConfig
from app.model.bounding_box import BoundingBox
from app.model.particle import Particle
from app.model.stream import Stream


class Cloud(object):
    @staticmethod
    def from_stream(stream: Stream[float], config: CloudConfig) -> 'Cloud':
        period = stream.read()
        particles: List[Particle] = []
        while not stream.is_done():
            particles.append(Particle.from_stream(stream))
        return Cloud(particles, period, config)

    def __init__(self, particles: List[Particle], period: float, config: CloudConfig) -> None:
        self.__num_primary = len(particles)
        self.__period = period
        self.__config = config

        steps = [sign * (k + 1) for k in range(config.num_instances // 2) for sign in [1, -1]]
        steps = [0, *steps[:config.num_instances - 1]]
        self.__particles = [Particle(p.x + k * self.__period, p.y) for k in steps for p in particles]

    @property
    def primary_particles(self) -> List[Particle]:
        return self.__particles[:self.__num_primary]

    @property
    def fringe_particles(self) -> List[Particle]:
        fringe_size = min(len(self.__particles), 2 * self.__num_primary)
        return self.__particles[:fringe_size]

    @property
    def secondary_particles(self):
        return self.__particles[self.__num_primary:]

    @property
    def particles(self) -> List[Particle]:
        return self.__particles

    @property
    def particle_radius(self) -> float:
        return self.__config.particle_radius

    @property
    def bounding_box(self) -> BoundingBox:
        min_x = min(p.x for p in self.particles)
        min_y = min(p.y for p in self.particles)
        max_x = max(p.x for p in self.particles)
        max_y = max(p.y for p in self.particles)
        return BoundingBox(min_x, min_y, max_x, max_y)

    def centered(self) -> 'Cloud':
        center = sum(self.__particles, start=Particle.zero()) / len(self.__particles)
        centered_particles = [particle - center for particle in self.primary_particles]
        return Cloud(centered_particles, self.__period, self.__config)

    def to_array(self) -> List[float]:
        return [self.__period, *(value for particle in self.primary_particles for value in particle.to_array())]
