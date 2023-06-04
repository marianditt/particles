from dataclasses import dataclass


@dataclass
class CloudConfig(object):
    num_particles: int
    num_instances: int
    particle_radius: float
