from typing import Tuple

from sympy import Expr, Float, Piecewise

from app.objective.math import squared_distance
from app.objective.types import Cloud, Light


class ObjectiveFactory(object):
    @staticmethod
    def create_particle(index: int) -> Tuple[str, str]:
        return f"particle_{index}.x", f"particle_{index}.y"

    @staticmethod
    def create_ray(index: int) -> Tuple[str, str]:
        return f"ray_{index}.x0", f"ray_{index}.phi"

    @staticmethod
    def create_particle_objective(cloud: Cloud, light: Light, min_distance: float) -> Expr:
        return ObjectiveFactory.create_min_distance_objective(cloud, min_distance) + \
            ObjectiveFactory.create_min_gap_objective(cloud, light)

    @staticmethod
    def create_min_distance_objective(cloud: Cloud, min_distance: float) -> Expr:
        num_particles = len(cloud)
        min_sqr_dist = min_distance * min_distance

        objective: Expr = Float(0.0)
        for i in range(num_particles):
            particle_i = cloud[i]
            for j in range(i + 1, num_particles):
                particle_j = cloud[j]
                regret: Expr = min_sqr_dist - squared_distance(particle_i, particle_j)
                objective += Piecewise((regret, regret > 0), (Float(0.0), True))
        return objective

    @staticmethod
    def create_min_gap_objective(cloud: Cloud, light: Light) -> Expr:
        objective: Expr = Float(0.0)
        for ray in light:
            for particle in cloud:
                pass
        return objective
