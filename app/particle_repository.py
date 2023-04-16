from optimization.types import Assignment


class ParticleRepository(object):
    def __init__(self) -> None:
        self.__iteration_count: int = 0
        self.__assignment: Assignment = {}

    def increment_iteration_count(self) -> None:
        self.__iteration_count += 1

    def iteration_count(self) -> int:
        return self.__iteration_count

    def update_assignment(self, assignment: Assignment) -> None:
        self.__assignment = {**self.__assignment, **assignment}

    def get_assignment(self) -> Assignment:
        return self.__assignment
