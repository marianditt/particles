from optimization.types import Gradient, Assignment


def gradient_descent(gradient: Gradient, assignment: Assignment, step_size: float = 0.01) -> Assignment:
    step = {symbol: derivative.evalf(subs=assignment) for symbol, derivative in gradient.items()}
    return {symbol: assignment[symbol] - step_size * value for symbol, value in step.items()}
