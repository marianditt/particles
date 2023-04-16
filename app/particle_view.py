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
        self.draw_cloud(cloud)
        self.draw_light(self.__particle_service.light(), view_radius(cloud))
        self.__viewer.show()

    def draw_cloud(self, cloud: Cloud) -> None:
        for particle in cloud.particles:
            center = (particle.center.x, particle.center.y)
            self.__viewer.draw_circle(center, particle.radius, 'b')

    def draw_light(self, light: Light, ray_size: float) -> None:
        for ray in light.rays:
            direction = ray.direction
            p1 = ray_size * (-direction + ray.x0 * Vector.ex())
            p2 = ray_size * (direction + ray.x0 * Vector.ex())
            self.__viewer.draw_line((p1.x, p1.y), (p2.x, p2.y), 'r')


def view_radius(cloud: Cloud) -> float:
    min_x = min(particle.center.x - particle.radius for particle in cloud.particles)
    min_y = max(particle.center.y - particle.radius for particle in cloud.particles)
    max_x = max(particle.center.x + particle.radius for particle in cloud.particles)
    max_y = max(particle.center.y + particle.radius for particle in cloud.particles)
    return max(max_x, -min_x, max_y, -min_y)
