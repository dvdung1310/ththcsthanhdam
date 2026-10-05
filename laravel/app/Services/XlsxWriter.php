<?php

namespace App\Services;

use RuntimeException;
use ZipArchive;

class XlsxWriter
{
    public const PLAIN = 0;
    public const TITLE = 1;
    public const HEADER = 2;
    public const CELL = 3;
    public const CELL_CENTER = 4;
    public const CELL_BOLD = 5;
    public const NOTE = 6;
    public const CENTER = 7;

    private array $rows = [];
    private array $merges = [];
    private array $widths = [];
    private array $strings = [];
    private array $stringIndex = [];
    private bool $landscape = true;

    public function addRow(array $cells, int $style = self::CELL): int
    {
        $this->rows[] = array_map(fn ($cell) => is_array($cell) ? $cell + ['style' => $style] : ['value' => $cell, 'style' => $style], $cells);

        return count($this->rows);
    }

    public function merge(int $row, int $fromColumn, int $toColumn, ?int $toRow = null): void
    {
        $this->merges[] = $this->ref($fromColumn, $row).':'.$this->ref($toColumn, $toRow ?? $row);
    }

    public function widths(array $widths): void
    {
        $this->widths = $widths;
    }

    public function save(string $path, string $sheetName = 'Sheet1'): void
    {
        $zip = new ZipArchive();
        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Không tạo được file Excel.');
        }
        $sheet = $this->sheetXml();
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'.$this->escape(mb_substr($sheetName, 0, 31)).'" sheetId="1" r:id="rId1"/></sheets></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>');
        $zip->addFromString('xl/styles.xml', $this->stylesXml());
        $zip->addFromString('xl/worksheets/sheet1.xml', $sheet);
        $zip->addFromString('xl/sharedStrings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="'.count($this->strings).'" uniqueCount="'.count($this->strings).'">'.implode('', array_map(fn ($s) => '<si><t xml:space="preserve">'.$this->escape($s).'</t></si>', $this->strings)).'</sst>');
        $zip->close();
    }

    private function sheetXml(): string
    {
        $cols = '';
        foreach ($this->widths as $index => $width) {
            $cols .= '<col min="'.($index + 1).'" max="'.($index + 1).'" width="'.$width.'" customWidth="1"/>';
        }
        $data = '';
        foreach ($this->rows as $r => $cells) {
            $data .= '<row r="'.($r + 1).'">';
            foreach (array_values($cells) as $c => $cell) {
                $ref = $this->ref($c + 1, $r + 1);
                $value = $cell['value'];
                if ($value === null || $value === '') {
                    $data .= '<c r="'.$ref.'" s="'.$cell['style'].'"/>';
                } elseif (is_int($value) || is_float($value)) {
                    $data .= '<c r="'.$ref.'" s="'.$cell['style'].'"><v>'.$value.'</v></c>';
                } else {
                    $data .= '<c r="'.$ref.'" s="'.$cell['style'].'" t="s"><v>'.$this->stringId((string) $value).'</v></c>';
                }
            }
            $data .= '</row>';
        }
        $merges = $this->merges ? '<mergeCells count="'.count($this->merges).'">'.implode('', array_map(fn ($m) => '<mergeCell ref="'.$m.'"/>', $this->merges)).'</mergeCells>' : '';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
            .($cols ? '<cols>'.$cols.'</cols>' : '').'<sheetData>'.$data.'</sheetData>'.$merges
            .'<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="'.($this->landscape ? 'landscape' : 'portrait').'" fitToWidth="1" fitToHeight="0"/></worksheet>';
    }

    private function stylesXml(): string
    {
        $border = '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>';
        $xf = fn ($font, $fill, $border, $h = null, $wrap = true) => '<xf numFmtId="0" fontId="'.$font.'" fillId="'.$fill.'" borderId="'.$border.'" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"'.($h ? ' horizontal="'.$h.'"' : '').($wrap ? ' wrapText="1"' : '').'/></xf>';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<fonts count="4"><font><sz val="11"/><name val="Times New Roman"/></font><font><b/><sz val="14"/><name val="Times New Roman"/></font><font><b/><sz val="11"/><name val="Times New Roman"/></font><font><i/><sz val="10"/><name val="Times New Roman"/></font></fonts>'
            .'<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/><bgColor indexed="64"/></patternFill></fill></fills>'
            .'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'.$border.'</borders>'
            .'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            .'<cellXfs count="8">'.$xf(0, 0, 0, null, false).$xf(1, 0, 0, 'center').$xf(2, 2, 1, 'center').$xf(0, 0, 1).$xf(0, 0, 1, 'center').$xf(2, 0, 1, 'center').$xf(3, 0, 0, null, false).$xf(2, 0, 0, 'center').'</cellXfs>'
            .'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
            .'</styleSheet>';
    }

    private function stringId(string $value): int
    {
        if (! isset($this->stringIndex[$value])) {
            $this->stringIndex[$value] = count($this->strings);
            $this->strings[] = $value;
        }

        return $this->stringIndex[$value];
    }

    private function ref(int $column, int $row): string
    {
        $name = '';
        while ($column > 0) {
            $mod = ($column - 1) % 26;
            $name = chr(65 + $mod).$name;
            $column = intdiv($column - 1, 26);
        }

        return $name.$row;
    }

    private function escape(string $value): string
    {
        return htmlspecialchars(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $value), ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
