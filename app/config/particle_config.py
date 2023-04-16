from dataclasses import dataclass


@dataclass
class ParticleConfig(object):
    num_particles: int
    num_rays: int
    particle_radius: float
    min_distance: float
    max_iterations: int
