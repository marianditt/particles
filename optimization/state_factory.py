from optimization.optimization_algorithm import State


class StateFactory(object):
    def create_state(self) -> State:
        raise NotImplementedError()
