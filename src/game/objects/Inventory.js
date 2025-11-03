export class Inventory {
  constructor(size = 10, data) {
    this.size = size
    this.slots = Array.from({ length: size }, () => null)
    if (data) this.fromJSON(data)
    this._onChanged = null
  }
  onChanged(cb) { this._onChanged = cb }
  _emitChanged() { this._onChanged && this._onChanged(this) }

  fromJSON(data) {
    this.slots = Array.from({ length: this.size }, (_, i) => {
      const s = data?.[i]
      return s && s.id && s.qty > 0 ? { id: s.id, qty: Number(s.qty) } : null
    })
    this._emitChanged()
  }
  toJSON() { return this.slots.map(s => (s ? { id: s.id, qty: s.qty } : null)) }

  get(i) { return this.slots[i] }
  set(i, id, qty) {
    if (i < 0 || i >= this.size) return
    this.slots[i] = (!id || qty <= 0) ? null : { id, qty: Number(qty) }
    this._emitChanged()
  }

  add(id, amount) {
    if (!id || amount <= 0) return amount
    const stack = 999999
    let rest = amount
    for (let i = 0; i < this.size && rest > 0; i++) {
      const s = this.slots[i]
      if (s && s.id === id) {
        const canPut = stack - s.qty
        if (canPut > 0) {
          const put = Math.min(canPut, rest)
          s.qty += put
          rest -= put
        }
      }
    }
    for (let i = 0; i < this.size && rest > 0; i++) {
      if (!this.slots[i]) {
        const put = Math.min(rest, stack)
        this.slots[i] = { id, qty: put }
        rest -= put
      }
    }
    this._emitChanged()
    return rest
  }

  remove(id, amount) {
    if (amount <= 0) return 0
    let left = amount
    for (let i = 0; i < this.size && left > 0; i++) {
      const s = this.slots[i]
      if (s && s.id === id) {
        const take = Math.min(s.qty, left)
        s.qty -= take
        if (s.qty <= 0) this.slots[i] = null
        left -= take
      }
    }
    this._emitChanged()
    return amount - left
  }
}