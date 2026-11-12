// Satu-satunya tempat format harga dan hitung total.
// Total keranjang = total checkout = total tagihan. Selisih satu rupiah = bug.

/** Harga produk dalam rupiah utuh. null = belum ditetapkan -> tidak boleh dibeli. */
export type Price = number | null | undefined;

export function isPurchasable(harga: Price): harga is number {
  return typeof harga === 'number' && Number.isFinite(harga) && harga > 0;
}

export function formatRupiah(harga: Price): string {
  if (!isPurchasable(harga)) return 'Harga segera hadir';
  return 'Rp' + Math.round(harga).toLocaleString('id-ID');
}

/** Total dari daftar item (qty selalu 1 per produk digital). Item tanpa harga ditolak. */
export function cartTotal(items: { harga: Price }[]): number {
  return items.reduce((sum, item) => {
    if (!isPurchasable(item.harga)) {
      throw new Error('Item tanpa harga final tidak boleh masuk total.');
    }
    return sum + Math.round(item.harga);
  }, 0);
}
