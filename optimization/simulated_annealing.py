import math
from dataclasses import dataclass
from typing import Callable, List

from optimization.optimization_algorithm import OptimizationAlgorithm
from optimization.state_factory import StateFactory

State = List[float]
Objective = Callable[[State], float]
NeighborProvider = Callable[[State], State]
TemperatureProvider = Callable[[int], float]


@dataclass
class SimulatedAnnealingConfig(object):
    std_step_size: float
    num_iterations: int
    max_temperature: float


class SimulatedAnnealing(OptimizationAlgorithm):
    @staticmethod
    def create_default(objective: Objective, state_factory: StateFactory,
                       config: SimulatedAnnealingConfig) -> 'SimulatedAnnealing':
        neighbor_provider = create_default_neighbor_provider(config.std_step_size)
        temperature_provider = create_default_temperature_provider(config.num_iterations, config.max_temperature)
        return SimulatedAnnealing(objective, state_factory, neighbor_provider, temperature_provider)

    def __init__(self,
                 objective: Objective,
                 state_factory: StateFactory,
                 neighbor_provider: NeighborProvider,
                 temperature_provider: TemperatureProvider) -> None:
        self.__objective = objective
        self.__neighbor_provider = neighbor_provider
        self.__temperature_provider = temperature_provider
        self.__state_factory = state_factory

        self.__best_state: State = []
        self.__current_state: State = []
        self.__index = 0
        self.reset()

    def reset(self) -> None:
        self.__current_state = self.__state_factory.create_state()
        self.__best_state = self.__current_state
        self.__index = 0

    def step(self) -> None:
        from random import random

        self.__index += 1
        neighbor_state = self.__neighbor_provider(self.__current_state)
        neighbor_energy = self.__objective(neighbor_state)

        if neighbor_energy < self.__objective(self.__best_state):
            self.__best_state = neighbor_state
            self.__current_state = neighbor_state
            return

        current_energy = self.__objective(self.__current_state)
        if neighbor_energy < current_energy:
            self.__current_state = neighbor_state
            return

        temperature = max(self.__temperature_provider(self.__index), 1e-12)
        threshold = math.exp((current_energy - neighbor_energy) / temperature)
        if random() < threshold:
            self.__current_state = neighbor_state

    def is_done(self) -> bool:
        return self.__temperature_provider(self.__index) <= 0.0

    def best_state(self) -> State:
        return self.__best_state


def create_default_neighbor_provider(std_step_size: float) -> NeighborProvider:
    from random import gauss
    return lambda state: [gauss(value, std_step_size) for value in state]


def create_default_temperature_provider(num_iterations: int, max_temperature: float) -> TemperatureProvider:
    return lambda time: max_temperature / (time + 1.0) - max_temperature / num_iterations
