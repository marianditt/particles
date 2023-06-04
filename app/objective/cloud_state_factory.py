from app.config.state_factory_config import StateFactoryConfig
from app.model.particle import Particle
from optimization.optimization_algorithm import State
from optimization.state_factory import StateFactory


class CloudStateFactory(StateFactory):
    def __init__(self, config: StateFactoryConfig) -> None:
        self.__config = config

    def create_state(self) -> State:
        from random import random
        from app.model.cloud import Cloud

        particles = [self.__create_particle() for _ in range(self.__config.cloud.num_particles)]
        particles = sorted(particles, key=lambda p: p.y)
        particles = sorted(particles, key=lambda p: p.x)

        period = random() * self.__config.max_period

        return State(Cloud(particles, period, self.__config.cloud).to_array())

    def __create_particle(self) -> Particle:
        from random import gauss
        x = gauss(0.0, self.__config.std_spread_x)
        y = gauss(0.0, self.__config.std_spread_y)
        return Particle(x, y)
