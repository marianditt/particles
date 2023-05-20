from app.config.state_factory_config import StateFactoryConfig
from app.model.vector import Vector
from optimization.optimization_algorithm import State
from optimization.state_factory import StateFactory


class CloudStateFactory(StateFactory):
    def __init__(self, config: StateFactoryConfig) -> None:
        self.__config = config

    def create_state(self) -> State:
        from random import random
        from app.model.cloud import Cloud
        particles = [self.__create_particle() for _ in range(self.__config.cloud.num_particles)]
        period = random() * self.__config.max_period
        return Cloud(particles, period, self.__config.cloud).to_array()

    def __create_particle(self) -> Vector:
        from random import gauss
        x = gauss(0.0, self.__config.std_spread)
        y = gauss(0.0, self.__config.std_spread)
        return Vector(x, y)
