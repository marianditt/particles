from typing import List

State = List[float]


class OptimizationAlgorithm(object):
    def reset(self) -> None:
        raise NotImplementedError()

    def step(self) -> None:
        raise NotImplementedError()

    def best_state(self) -> State:
        raise NotImplementedError()
