from typing import Set

from sympy import Symbol

from app.config.particle_config import ParticleConfig
from app.model.cloud import Cloud
from app.model.light import Light
from app.particle_repository import ParticleRepository


class ParticleService:
    def __init__(self, particle_repository: ParticleRepository, config: ParticleConfig) -> None:
        from app.objective.objective_factory import ObjectiveFactory
        from sympy import diff

        self.__particle_repository = particle_repository
        self.__config = config

        self.__cloud = ObjectiveFactory.create_cloud(config.num_particles)
        self.__light = ObjectiveFactory.create_light(config.num_rays)

        particle_objective = ObjectiveFactory.create_particle_objective(self.__cloud, self.__light, config.min_distance)
        particle_gradient = {symbol: diff(particle_objective, symbol) for symbol in self.__cloud}
        self.__gradient = {**particle_gradient}

    def make_random(self) -> None:
        from sympy import Symbol
        from random import random

        cloud_symbols: Set[Symbol] = set().union(*(particle.free_symbols for particle in self.__cloud))
        self.__particle_repository.update_assignment({key: random() for key in cloud_symbols})

    def cloud(self) -> Cloud:
        from sympy import Symbol

        self.__particle_repository.get_assignment()
        x = Symbol('x')
        centers = []
        return self.__particle_repository.cloud()

    def light(self) -> Light:
        return Light([])

    def is_done(self) -> bool:
        return self.__particle_repository.iteration_count() == self.__config.max_iterations

    def step(self) -> None:
        from optimization.gradient_descent import gradient_descent

        assignment = self.__particle_repository.get_assignment()
        assignment = gradient_descent(self.__gradient, assignment)
        self.__particle_repository.update_assignment(assignment)
        self.__particle_repository.increment_iteration_count()
