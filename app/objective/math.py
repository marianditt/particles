from sympy import Expr

from app.objective.types import Particle, Ray


def squared_distance(particle_0: Particle, particle_1: Particle) -> Expr:
    difference: Particle = particle_1 - particle_0
    return difference.dot(difference)


def signed_distance(ray: Ray, particle: Particle) -> Expr:
    pass
