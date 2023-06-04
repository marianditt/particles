from dataclasses import dataclass

from optimization.optimization_algorithm import OptimizationAlgorithm, State
from optimization.simulated_annealing import Objective
from optimization.state_factory import StateFactory


@dataclass
class MonteCarloOptimizationConfig(object):
    num_iterations_per_step: int
    ranges: State


class MonteCarloOptimization(OptimizationAlgorithm):
    def __init__(self, objective: Objective, state_factory: StateFactory, config: MonteCarloOptimizationConfig) -> None:
        self.__objective = objective
        self.__state_factory = state_factory
        self.__config = config
        self.__best_state = State([])
        self.reset()

    def reset(self) -> None:
        self.__best_state = self.__state_factory.create_state()

    def step(self) -> None:
        from random import random
        best_energy = self.__objective(self.__best_state)

        for _ in range(self.__config.num_iterations_per_step):
            next_state = State(s + r * (2 * random() - 1) for s, r in zip(self.__best_state, self.__config.ranges))
            next_energy = self.__objective(next_state)
            if next_energy < best_energy:
                self.__best_state = next_state
                best_energy = next_energy

    def best_state(self) -> State:
        return self.__best_state
