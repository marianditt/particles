from typing import Mapping

from sympy import Expr, Symbol

Gradient = Mapping[Symbol, Expr]
Assignment = Mapping[Symbol, float]
