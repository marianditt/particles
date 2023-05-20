from typing import List

from app.config.cloud_config import CloudConfig
from app.model.stream import Stream
from app.model.vector import Vector


class Cloud(object):
    @staticmethod
    def from_stream(stream: Stream[float], config: CloudConfig) -> 'Cloud':
        period = stream.read()
        particles: List[Vector] = []
        while not stream.is_done():
            particles.append(Vector.from_stream(stream))
        return Cloud(particles, period, config)

    def __init__(self, particles: List[Vector], period: float, config: CloudConfig) -> None:
        self.__num_primary = len(particles)
        self.__period = period
        self.__particle_radius = config.particle_radius

        all_particles = [Vector(p.x + k * self.__period, p.y) for k in range(config.num_repetitions) for p in particles]
        c = sum(all_particles, start=Vector.zero()) / len(all_particles)
        self.__particles = [p - c for p in all_particles]

    @property
    def primary_particles(self) -> List[Vector]:
        return self.__particles[:self.__num_primary]

    @property
    def fringe_particles(self) -> List[Vector]:
        fringe_size = min(len(self.__particles), 2 * self.__num_primary)
        return self.__particles[:fringe_size]

    @property
    def secondary_particles(self):
        return self.__particles[self.__num_primary:]

    @property
    def particles(self) -> List[Vector]:
        return self.__particles

    @property
    def particle_radius(self) -> float:
        return self.__particle_radius

    def to_array(self) -> List[float]:
        return [self.__period, *(value for particle in self.primary_particles for value in particle.to_array())]
