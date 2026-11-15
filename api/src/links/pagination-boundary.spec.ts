describe('Module 8 Pagination Offset & Boundaries', () => {
  // Minimal failing example reproducing the off-by-one bug
  function calculateBuggyOffset(page: number, pageSize: number): number {
    return page * pageSize;
  }

  // Correct offset calculation
  function calculateCorrectOffset(page: number, pageSize: number): number {
    return (page - 1) * pageSize;
  }

  describe('Minimal Failing Example (Original Buggy Calculation)', () => {
    it('demonstrates that page * pageSize causes an off-by-one error by skipping the first page', () => {
      const page = 1;
      const pageSize = 20;

      const buggyOffset = calculateBuggyOffset(page, pageSize);
      // Bug: page 1 computes offset 20 instead of 0!
      expect(buggyOffset).toBe(20);
      expect(buggyOffset).not.toBe(0); // Fails the requirement that page 1 starts at index 0

      // For a dataset of 5 records, an offset of 20 skips all records:
      const totalRecords = 5;
      const skippedCount = Math.min(buggyOffset, totalRecords);
      const remainingCount = Math.max(0, totalRecords - buggyOffset);
      expect(skippedCount).toBe(5);
      expect(remainingCount).toBe(0); // Returns 0 items even though total is 5
    });

    it('demonstrates that page 2 skips 2 * pageSize items', () => {
      const page = 2;
      const pageSize = 20;

      const buggyOffset = calculateBuggyOffset(page, pageSize);
      expect(buggyOffset).toBe(40); // Skips 40 items instead of 20
    });
  });

  describe('Corrected Offset Calculation & Boundary Verification', () => {
    it('page 1 produces offset 0', () => {
      const page = 1;
      const pageSize = 20;
      expect(calculateCorrectOffset(page, pageSize)).toBe(0);
    });

    it('page 2 produces offset pageSize', () => {
      const page = 2;
      const pageSize = 20;
      expect(calculateCorrectOffset(page, pageSize)).toBe(20);
    });

    it('handles custom page_size 100 boundaries correctly', () => {
      expect(calculateCorrectOffset(1, 100)).toBe(0);
      expect(calculateCorrectOffset(2, 100)).toBe(100);
      expect(calculateCorrectOffset(3, 100)).toBe(200);
    });

    it('returns all matching records when result set is smaller than page_size', () => {
      const totalMatching = 7;
      const pageSize = 20;
      const offset = calculateCorrectOffset(1, pageSize); // 0
      const itemsOnPage = Math.min(pageSize, Math.max(0, totalMatching - offset));

      expect(offset).toBe(0);
      expect(itemsOnPage).toBe(7); // All 7 items returned on page 1
    });
  });
});
