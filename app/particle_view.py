import math

from app.model.cloud import Cloud
from app.model.light import Light
from app.model.vector import Vector
from app.particle_service import ParticleService
from view.viewer import Viewer


class ParticleView(object):
    def __init__(self, particle_service: ParticleService, viewer: Viewer) -> None:
        self.__particle_service = particle_service
        self.__viewer = viewer

    def on_update(self) -> None:
        self.__viewer.clear()

        cloud = self.__particle_service.cloud()
        light = self.__particle_service.light()
        self.draw_light(light, view_radius(cloud))
        self.draw_cloud(cloud)
        self.__viewer.show()

    def draw_cloud(self, cloud: Cloud) -> None:
        for particle in cloud.primary_particles:
            center = (particle.x, particle.y)
            self.__viewer.draw_circle(center, cloud.particle_radius, 'b')

        for particle in cloud.secondary_particles:
            center = (particle.x, particle.y)
            self.__viewer.draw_circle(center, cloud.particle_radius, 'c')

    def draw_light(self, light: Light, ray_size: float) -> None:
        self.draw_ray(light.primary_ray, ray_size, 'r')
        for ray in light.secondary_rays:
            self.draw_ray(ray, ray_size, 'm')

    def draw_ray(self, ray: float, ray_size: float, style: str) -> None:
        direction = Vector(math.cos(ray), math.sin(ray))
        p1 = ray_size * -direction
        p2 = ray_size * direction
        self.__viewer.draw_line((p1.x, p1.y), (p2.x, p2.y), style)


def view_radius(cloud: Cloud) -> float:
    min_x = min(particle.x - cloud.particle_radius for particle in cloud.particles)
    min_y = max(particle.y - cloud.particle_radius for particle in cloud.particles)
    max_x = max(particle.x + cloud.particle_radius for particle in cloud.particles)
    max_y = max(particle.y + cloud.particle_radius for particle in cloud.particles)
    return max(max_x, -min_x, max_y, -min_y)
