/** A drainable mutation queue: dependent actions await all edits, including edits
 * made while an earlier request is in flight. Failed mutations remain retryable. */
export class SaveQueue<T> {
  private pending: T | null = null;
  private flight: Promise<void> | null = null;
  constructor(private commit: (value: T) => Promise<void>) {}
  enqueue(value: T) {
    this.pending = value;
  }
  get dirty() {
    return this.pending !== null || this.flight !== null;
  }
  get queued() {
    return this.pending;
  }
  flush(): Promise<void> {
    if (this.flight) return this.flight;
    const drain = async () => {
      while (this.pending !== null) {
        const value = this.pending;
        this.pending = null;
        try {
          await this.commit(value);
        } catch (error) {
          this.pending ??= value;
          throw error;
        }
      }
    };
    this.flight = drain().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
}
