import { findClosestRoot } from '../lifecycle'
import { magic } from '../magics'

magic('root', (el) => findClosestRoot(el))
