import { findClosestRoot } from '../lifecycle'
import { directive } from '../directives'

function handler() {}

handler.inline = (el, { expression }, { cleanup }) => {
    let root = findClosestRoot(el)

    if (!root._x_refs) root._x_refs = {}

    root._x_refs[expression] = el

    cleanup(() => delete root._x_refs[expression])
}

directive('ref', handler)
