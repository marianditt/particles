from dataclasses import dataclass
from typing import Callable, List

from optimization.optimization_algorithm import OptimizationAlgorithm, State
from optimization.state_factory import StateFactory

Objective = Callable[[State], float]


@dataclass
class ParticleSwarmOptimizationConfig(object):
    num_particles: int
    std_initial_velocity: float
    momentum: float
    perception: float
    social: float


class ParticleSwarmOptimization(OptimizationAlgorithm):
    def __init__(self, objective: Objective, state_factory: StateFactory,
                 config: ParticleSwarmOptimizationConfig) -> None:
        self.__objective = objective
        self.__state_factory = state_factory
        self.__config = config

        self.__states: List[State] = []
        self.__velocities: List[State] = []
        self.__personal_bests: List[State] = []
        self.__best_state: State = []
        self.reset()

    def reset(self) -> None:
        from random import gauss
        from copy import deepcopy

        self.__states = [self.__state_factory.create_state() for _ in range(self.__config.num_particles)]
        self.__velocities = [[gauss(0.0, self.__config.std_initial_velocity) for _ in range(len(state))]
                             for state in self.__states]
        self.__personal_bests = deepcopy(self.__states)
        self.__best_state = deepcopy(self.__states[0])

    def step(self) -> None:
        from random import random
        from copy import deepcopy

        for i in range(len(self.__states)):
            for d in range(len(self.__states[i])):
                state_value = self.__states[i][d]
                momentum_velocity = self.__config.momentum * self.__velocities[i][d]
                perception_velocity = self.__config.perception * random() * (self.__personal_bests[i][d] - state_value)
                social_velocity = self.__config.social * random() * (self.__best_state[d] - state_value)
                self.__velocities[i][d] = momentum_velocity + perception_velocity + social_velocity
                self.__states[i][d] = state_value + self.__velocities[i][d]

        best_reference = self.__best_state
        best_energy = self.__objective(best_reference)
        for i, state in enumerate(self.__states):
            energy = self.__objective(state)
            if energy < best_energy:
                best_reference = state
                best_energy = energy

            if energy < self.__objective(self.__personal_bests[i]):
                self.__personal_bests[i] = deepcopy(state)
        self.__best_state = deepcopy(best_reference)

    def best_state(self) -> State:
        return self.__best_state
