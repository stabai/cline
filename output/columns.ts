export class ColumnPrinter<DataSetKeys extends PropertyKey = PropertyKey> implements ColumnOptions<DataSetKeys> {
  maxWidth = process.stdout.columns || 80;
  padding = 2;
  columnFormatters: Record<number, (arg0: string) => string> = {};
  paddingChar = ' ';
  rowPrefix = '';
  dataSets = {} as Record<DataSetKeys, unknown[][]>;

  constructor(options: ColumnOptions<DataSetKeys>) {
    Object.assign(this, options);
    for (const dataSet of Object.values(this.dataSets)) {
      this.updateColumnWidths(dataSet as unknown[][]);
    }
  }

  private readonly columnWidths: number[] = [];

  private updateColumnWidths(dataSet: unknown[][]): void {
    for (const row of dataSet) {
      for (let i = 0; i < row.length; i++) {
        const cellWidth = row[i]?.toString().length ?? 0;
        if (this.columnWidths[i] == null || this.columnWidths[i] < cellWidth) {
          this.columnWidths[i] = cellWidth;
        }
      }
    }
  }
  
  addDataSet<T extends string>(key: T, data: unknown[][]): ColumnPrinter<DataSetKeys | T> {
    this.updateColumnWidths(data);
    const updatedPrinter = this as ColumnPrinter<DataSetKeys | T>;
    updatedPrinter.dataSets[key] = data;
    return updatedPrinter;
  }

  printDataSet(key: DataSetKeys): void {
    for (const row of this.dataSets[key]) {
      const paddedCells = row.map((cell, i) => {
        const cellText = (cell ?? '').toString();
        const cellPadding = this.paddingChar.repeat(this.columnWidths[i] - cellText.length);
        const formatter = this.columnFormatters[i];
        const formattedCellText = formatter == null ? cellText : formatter(cellText);
        return formattedCellText + cellPadding;
      });
      console.log(this.rowPrefix + paddedCells.join(this.paddingChar.repeat(this.padding)));
    }  
  }
}

interface ColumnOptions<DataSetKeys extends PropertyKey> {
  maxWidth?: number;
  padding?: number;
  paddingChar?: string;
  rowPrefix?: string;
  columnFormatters?: Record<number, (arg0: string) => string>;
  dataSets?: Record<DataSetKeys, unknown[][]>;
}
