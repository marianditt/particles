import math
from typing import Optional

from app.model.cloud import Cloud
from app.model.light import Light
from app.objective.gap_utils import find_ray_gaps, Gap
from app.particle_service import ParticleService
from view.viewer import Viewer


class ParticleView(object):
    def __init__(self, particle_service: ParticleService, viewer: Viewer) -> None:
        self.__particle_service = particle_service
        self.__viewer = viewer

    def on_update(self) -> None:
        cloud = self.__particle_service.cloud().centered()
        light = self.__particle_service.light()
        size = 2 * view_radius(cloud)

        self.__viewer.clear(size, size)
        self.draw_light(light, cloud, 2 * size)
        self.draw_cloud(cloud)
        self.__viewer.show()

    def draw_cloud(self, cloud: Cloud) -> None:
        for particle in cloud.primary_particles:
            center = (particle.x, particle.y)
            self.__viewer.draw_disc(center, cloud.particle_radius, 'b')

        for particle in cloud.secondary_particles:
            center = (particle.x, particle.y)
            self.__viewer.draw_disc(center, cloud.particle_radius, 'c')

    def draw_light(self, light: Light, cloud: Cloud, ray_size: float) -> None:
        self.draw_gap(light.primary_ray, cloud, ray_size)
        for ray in light.secondary_rays:
            self.draw_gap(ray, cloud, ray_size)

    def draw_gap(self, ray: float, cloud: Cloud, ray_size: float) -> None:
        critical_gaps = [gap for gap in find_ray_gaps(cloud, ray)
                         if gap.size > 0]
        max_gap: Optional[Gap] = max(critical_gaps, key=lambda gap: gap.size, default=None)

        if max_gap is None:
            return

        base_x = math.cos(max_gap.rotation)
        base_y = math.sin(max_gap.rotation)

        effective_gap_size = max_gap.size
        half_gap_x = 0.5 * effective_gap_size * base_x
        half_gap_y = 0.5 * effective_gap_size * math.sin(max_gap.rotation)

        half_ray_x = 0.5 * ray_size * -base_y
        half_ray_y = 0.5 * ray_size * base_x

        p1 = cloud.particles[max_gap.low_particle_index]
        p2 = cloud.particles[max_gap.high_particle_index]
        center = 0.5 * (p1 + p2)

        polygon = [(center.x - half_ray_x - half_gap_x, center.y - half_ray_y - half_gap_y),
                   (center.x - half_ray_x + half_gap_x, center.y - half_ray_y + half_gap_y),
                   (center.x + half_ray_x + half_gap_x, center.y + half_ray_y + half_gap_y),
                   (center.x + half_ray_x - half_gap_x, center.y + half_ray_y - half_gap_y)]
        self.__viewer.draw_polygon(polygon, color='r')


def view_radius(cloud: Cloud) -> float:
    min_x = min(particle.x - cloud.particle_radius for particle in cloud.particles)
    min_y = max(particle.y - cloud.particle_radius for particle in cloud.particles)
    max_x = max(particle.x + cloud.particle_radius for particle in cloud.particles)
    max_y = max(particle.y + cloud.particle_radius for particle in cloud.particles)
    return max(max_x, -min_x, max_y, -min_y)
