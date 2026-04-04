param(
  [Parameter(Mandatory = $true)]
  [string]$CashCsv,

  [Parameter(Mandatory = $true)]
  [string]$DepositCsv,

  [int]$FiscalYear = 2025,

  [string]$OutJson = ".\tmp\accounting-migration-preview.json",

  [string]$OutMarkdown = ".\tmp\accounting-migration-preview.md"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:Accounts = @(
  [ordered]@{ accountId = "cash_treasurer"; name = "現金（会計手元金）"; sortOrder = 10; isActive = $true },
  [ordered]@{ accountId = "cash_president"; name = "現金（会長手元金）"; sortOrder = 20; isActive = $true },
  [ordered]@{ accountId = "yucho"; name = "ゆうちょ銀行"; sortOrder = 30; isActive = $true }
)

$script:CategoryRules = @(
  [ordered]@{ categoryId = "income_membership_fee"; type = "income"; aliases = @("会費", "クラブ費") },
  [ordered]@{ categoryId = "income_donation"; type = "income"; aliases = @("寄付", "寄附") },
  [ordered]@{ categoryId = "income_subsidy_grant"; type = "income"; aliases = @("補助金", "助成金") },
  [ordered]@{ categoryId = "income_honorarium"; type = "income"; aliases = @("謝礼") },
  [ordered]@{ categoryId = "income_interest"; type = "income"; aliases = @("受取利息", "受取利子", "利息") },
  [ordered]@{ categoryId = "income_misc"; type = "income"; aliases = @("雑収入") },
  [ordered]@{ categoryId = "expense_instructor"; type = "expense"; aliases = @("講師謝礼金", "講師・その他", "謝礼", "講師") },
  [ordered]@{ categoryId = "expense_instrument_supply"; type = "expense"; aliases = @("楽譜購入費", "楽器付属品購入費", "楽器修理費") },
  [ordered]@{ categoryId = "expense_concert"; type = "expense"; aliases = @("施設使用料", "大会参加費", "楽器運搬費", "大会・演奏会雑費") },
  [ordered]@{ categoryId = "expense_burden"; type = "expense"; aliases = @("負担金", "吹奏楽連盟費") },
  [ordered]@{ categoryId = "expense_insurance"; type = "expense"; aliases = @("保険料") },
  [ordered]@{ categoryId = "expense_misc"; type = "expense"; aliases = @("消耗品費", "印刷費", "旅費・交通費", "慶弔・交際費", "雑費") }
)

function Ensure-Directory([string]$FilePath) {
  $directory = Split-Path -Parent $FilePath
  if ($directory -and -not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
}

function Normalize-Text([object]$Value) {
  if ($null -eq $Value) { return "" }
  return ([string]$Value).Trim()
}

function Parse-Amount([object]$Value) {
  $text = Normalize-Text $Value
  if ([string]::IsNullOrWhiteSpace($text)) { return [decimal]0 }
  $normalized = $text.Replace(",", "").Replace("¥", "").Replace("円", "").Trim()
  if ([string]::IsNullOrWhiteSpace($normalized)) { return [decimal]0 }
  return [decimal]::Parse($normalized, [System.Globalization.CultureInfo]::InvariantCulture)
}

function Parse-DateKey([string]$Value) {
  $text = Normalize-Text $Value
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $patterns = @("yyyy/M/d", "yyyy/MM/dd", "yyyy-M-d", "yyyy-MM-dd")
  foreach ($pattern in $patterns) {
    $parsed = [datetime]::MinValue
    if ([datetime]::TryParseExact($text, $pattern, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
      return $parsed.ToString("yyyy-MM-dd")
    }
  }
  $fallback = [datetime]::MinValue
  if ([datetime]::TryParse($text, [ref]$fallback)) {
    return $fallback.ToString("yyyy-MM-dd")
  }
  return $null
}

function Build-FiscalRange([int]$Year) {
  return [ordered]@{
    startDate = "{0}-09-01" -f $Year
    endDate = "{0}-08-31" -f ($Year + 1)
  }
}

function Get-CsvLines([string]$Path) {
  $encodings = @("Default", "UTF8", "Unicode", "Oem")
  foreach ($encoding in $encodings) {
    try {
      $lines = Get-Content -LiteralPath $Path -Encoding $encoding
      $headerMatches = @($lines | Where-Object { $_ -like "日付,*" })
      if ($lines -and $headerMatches.Count -gt 0) {
        return $lines
      }
    } catch {
    }
  }
  throw "CSV を読み込めませんでした: $Path"
}

function Convert-LinesToRows([string[]]$Lines, [string]$SourcePath, [string]$BookType, [string]$SectionName, [int]$HeaderLineNumber) {
  $header = $Lines[0]
  $dataLines = $Lines[1..($Lines.Count - 1)]
  if ($dataLines.Count -eq 0) { return @() }
  $csvText = ($header + [Environment]::NewLine + ($dataLines -join [Environment]::NewLine))
  $rows = $csvText | ConvertFrom-Csv
  $result = @()
  for ($index = 0; $index -lt $rows.Count; $index += 1) {
    $row = $rows[$index]
    $lineNumber = $HeaderLineNumber + 1 + $index
    $result += [pscustomobject]@{
      row = $row
      lineNumber = $lineNumber
      sourcePath = $SourcePath
      bookType = $BookType
      sectionName = $SectionName
    }
  }
  return $result
}

function Parse-BookSections([string]$Path, [string]$BookType, [string]$DefaultSectionName) {
  $lines = Get-CsvLines $Path
  $sections = @()
  $lineIndex = 0
  $currentSectionName = $DefaultSectionName

  while ($lineIndex -lt $lines.Count) {
    $line = $lines[$lineIndex].Trim()
    if ([string]::IsNullOrWhiteSpace($line)) {
      $lineIndex += 1
      continue
    }

    if ($line -notmatch "," -and $line -notmatch "^令和") {
      $currentSectionName = $line
      $lineIndex += 1
      continue
    }

    if ($line -match "^日付,") {
      $headerLineNumber = $lineIndex + 1
      $data = @($line)
      $lineIndex += 1
      while ($lineIndex -lt $lines.Count) {
        $candidate = $lines[$lineIndex]
        if ([string]::IsNullOrWhiteSpace($candidate)) { break }
        if ($candidate.Trim() -notmatch "," -and $candidate.Trim() -notmatch "^令和") { break }
        $data += $candidate
        $lineIndex += 1
      }
      $sections += [pscustomobject]@{
        sectionName = $currentSectionName
        rows = Convert-LinesToRows -Lines $data -SourcePath $Path -BookType $BookType -SectionName $currentSectionName -HeaderLineNumber $headerLineNumber
      }
      continue
    }

    $lineIndex += 1
  }

  return $sections
}

function Resolve-AccountId([string]$BookType, [string]$SectionName) {
  if ($BookType -eq "cash") { return "cash_treasurer" }
  switch ((Normalize-Text $SectionName)) {
    "ゆうちょ銀行" { return "yucho" }
    "会長手元金" { return "cash_president" }
    default { return $null }
  }
}

function Is-OpeningBalanceRow($Row) {
  return (Normalize-Text $Row.摘要) -eq "前年度より繰越"
}

function Is-TotalRow($Row) {
  return (Normalize-Text $Row.摘要) -eq "合計"
}

function Is-InPeriod([string]$DateKey, [hashtable]$FiscalRange) {
  if (-not $DateKey) { return $false }
  return ($DateKey -ge $FiscalRange.startDate) -and ($DateKey -le $FiscalRange.endDate)
}

function Get-TransferHints([string]$Text) {
  $normalized = Normalize-Text $Text
  $hints = @()
  if ($normalized -match "会長手元金") { $hints += "cash_president" }
  if ($normalized -match "ゆうちょ銀行|ゆうちょ|郵便") { $hints += "yucho" }
  if ($normalized -match "会計手元金|現金") { $hints += "cash_treasurer" }
  return $hints | Select-Object -Unique
}

function Test-TransferCandidate([string]$Subject, [string]$Memo) {
  $text = "{0} {1}" -f (Normalize-Text $Subject), (Normalize-Text $Memo)
  return $text -match "振替|引出|引き出し|預け入れ|預入"
}

function Resolve-CategoryMapping([string]$Type, [string]$Subject, [string]$Memo) {
  $subjectText = Normalize-Text $Subject
  $memoText = Normalize-Text $Memo

  foreach ($rule in $script:CategoryRules) {
    if ($rule.type -ne $Type) { continue }
    foreach ($alias in $rule.aliases) {
      if ($subjectText -eq $alias -or $subjectText -like "*$alias*" -or $memoText -like "*$alias*") {
        return [ordered]@{
          categoryId = $rule.categoryId
          matched = $true
          rule = $alias
        }
      }
    }
  }

  return [ordered]@{
    categoryId = $null
    matched = $false
    rule = $null
  }
}

function Build-CategoryMappingResults($NormalTransactions) {
  $grouped = $NormalTransactions |
    Group-Object -Property type, oldSubject

  $results = @()
  foreach ($group in $grouped) {
    $first = $group.Group[0]
    $sampleMemos = @()
    foreach ($item in $group.Group) {
      if ($item["memo"]) {
        $sampleMemos += [string]$item["memo"]
      }
    }
    $sampleMemos = @($sampleMemos | Select-Object -Unique | Select-Object -First 3)
    $results += [ordered]@{
      transactionType = $first.type
      oldSubject = $first.oldSubject
      mappedCategoryId = $first.categoryId
      matched = [bool]$first.categoryId
      count = $group.Count
      sampleMemos = $sampleMemos
    }
  }

  return $results | Sort-Object transactionType, oldSubject
}

function Build-MarkdownSummary($Preview) {
  $lines = @(
    "# 旧会計 CSV 変換サマリ",
    "",
    "- 対象期: $($Preview.period.label) ($($Preview.period.startDate) - $($Preview.period.endDate))",
    "- 読み込んだ総行数: $($Preview.summary.totalRowsRead)",
    "- 期首残高件数: $($Preview.summary.openingBalanceCount)",
    "- 通常収入件数: $($Preview.summary.incomeCount)",
    "- 通常支出件数: $($Preview.summary.expenseCount)",
    "- transfer 統合件数: $($Preview.summary.transferCount)",
    "- 未統合振替候補件数: $($Preview.summary.unmatchedTransferCandidateCount)",
    "- categoryId 対応できなかった件数: $($Preview.summary.unmappedCategoryCount)",
    ""
  )

  if ($Preview.unmatchedTransferCandidates.Count -gt 0) {
    $lines += "## 未統合振替候補"
    $lines += ""
    foreach ($item in $Preview.unmatchedTransferCandidates) {
      $lines += "- $($item.date) / $($item.accountName) / $($item.directionLabel) / $($item.amount)円 / $($item.memo) / $($item.reason)"
    }
    $lines += ""
  }

  return $lines -join [Environment]::NewLine
}

if (-not (Test-Path -LiteralPath $CashCsv)) { throw "現金出納帳 CSV が見つかりません: $CashCsv" }
if (-not (Test-Path -LiteralPath $DepositCsv)) { throw "預金出納帳 CSV が見つかりません: $DepositCsv" }

$fiscalRange = Build-FiscalRange $FiscalYear
$cashSections = Parse-BookSections -Path $CashCsv -BookType "cash" -DefaultSectionName "現金出納帳"
$depositSections = Parse-BookSections -Path $DepositCsv -BookType "deposit" -DefaultSectionName "預金出納帳"
$allSections = @($cashSections) + @($depositSections)

$openingBalances = @{}
$rawRows = @()
$transferCandidates = @()
$normalTransactions = @()
$skippedRows = @()
$unmappedAccounts = @()
$totalRowsRead = 0

foreach ($section in $allSections) {
  $accountId = Resolve-AccountId -BookType $section.rows[0].bookType -SectionName $section.sectionName
  if (-not $accountId) {
    $unmappedAccounts += $section.sectionName
    continue
  }

  $account = $script:Accounts | Where-Object { $_.accountId -eq $accountId } | Select-Object -First 1

  foreach ($entry in $section.rows) {
    $row = $entry.row
    if (Is-TotalRow $row) { continue }
    $totalRowsRead += 1

    $date = Parse-DateKey $row.日付
    $subject = Normalize-Text $row.科目
    $memo = Normalize-Text $row.摘要
    $incomeAmount = Parse-Amount $row.収入金額
    $expenseAmount = Parse-Amount $row.支出金額
    $balanceAmount = Parse-Amount $row.差引残高

    if (Is-OpeningBalanceRow $row) {
      $openingBalance = if ($balanceAmount -ne 0) { $balanceAmount } elseif ($incomeAmount -ne 0) { $incomeAmount } else { $expenseAmount }
      $openingBalances[$accountId] = [ordered]@{
        accountId = $accountId
        accountName = $account.name
        openingBalance = [int][math]::Round([double]$openingBalance, 0)
        source = [ordered]@{
          sourcePath = $entry.sourcePath
          sectionName = $entry.sectionName
          lineNumber = $entry.lineNumber
          memo = $memo
        }
      }
      continue
    }

    if (-not (Is-InPeriod -DateKey $date -FiscalRange $fiscalRange)) {
      $skippedRows += [ordered]@{
        accountId = $accountId
        accountName = $account.name
        date = $date
        subject = $subject
        memo = $memo
        incomeAmount = [int][math]::Round([double]$incomeAmount, 0)
        expenseAmount = [int][math]::Round([double]$expenseAmount, 0)
        reason = "outsideFiscalPeriod"
      }
      continue
    }

    $direction = if ($incomeAmount -gt 0 -and $expenseAmount -eq 0) { "income" } elseif ($expenseAmount -gt 0 -and $incomeAmount -eq 0) { "expense" } else { $null }
    if (-not $direction) {
      $skippedRows += [ordered]@{
        accountId = $accountId
        accountName = $account.name
        date = $date
        subject = $subject
        memo = $memo
        incomeAmount = [int][math]::Round([double]$incomeAmount, 0)
        expenseAmount = [int][math]::Round([double]$expenseAmount, 0)
        reason = "unsupportedAmountPattern"
      }
      continue
    }

    $amount = if ($direction -eq "income") { $incomeAmount } else { $expenseAmount }
    $candidate = [ordered]@{
      id = "{0}:{1}" -f [System.IO.Path]::GetFileName($entry.sourcePath), $entry.lineNumber
      sourcePath = $entry.sourcePath
      bookType = $entry.bookType
      sectionName = $entry.sectionName
      lineNumber = $entry.lineNumber
      accountId = $accountId
      accountName = $account.name
      date = $date
      direction = $direction
      directionLabel = if ($direction -eq "income") { "収入" } else { "支出" }
      amount = [int][math]::Round([double]$amount, 0)
      subject = $subject
      memo = $memo
      transferHints = @(Get-TransferHints -Text ("{0} {1}" -f $subject, $memo))
      isTransferCandidate = Test-TransferCandidate -Subject $subject -Memo $memo
    }

    if ($candidate.isTransferCandidate) {
      $transferCandidates += $candidate
      continue
    }

    $mapping = Resolve-CategoryMapping -Type $direction -Subject $subject -Memo $memo
    $normalTransactions += [ordered]@{
      type = $direction
      date = $date
      amount = $candidate.amount
      accountId = $accountId
      accountName = $account.name
      categoryId = $mapping.categoryId
      oldSubject = $subject
      memo = $memo
      source = [ordered]@{
        sourcePath = $entry.sourcePath
        sectionName = $entry.sectionName
        lineNumber = $entry.lineNumber
      }
    }
  }
}

$usedCandidateIds = New-Object System.Collections.Generic.HashSet[string]
$normalizedTransfers = @()
$unmatchedTransferCandidates = @()

$expenseCandidates = @($transferCandidates | Where-Object { $_.direction -eq "expense" } | Sort-Object date, amount, accountId, lineNumber)

foreach ($expenseCandidate in $expenseCandidates) {
  if ($usedCandidateIds.Contains($expenseCandidate.id)) { continue }

  $matches = @(
    $transferCandidates | Where-Object {
      $_.direction -eq "income" -and
      -not $usedCandidateIds.Contains($_.id) -and
      $_.date -eq $expenseCandidate.date -and
      $_.amount -eq $expenseCandidate.amount -and
      $_.accountId -ne $expenseCandidate.accountId
    }
  )

  if ($matches.Count -gt 1) {
    $scoredMatches = @(
      foreach ($candidate in $matches) {
        $score = 0
        if ($expenseCandidate.transferHints -contains $candidate.accountId) { $score += 2 }
        if ($candidate.transferHints -contains $expenseCandidate.accountId) { $score += 1 }
        [pscustomobject]@{
          candidate = $candidate
          score = $score
        }
      }
    )
    $bestScore = ($scoredMatches | Measure-Object -Property score -Maximum).Maximum
    $bestMatches = @($scoredMatches | Where-Object { $_.score -eq $bestScore })
    if ($bestScore -gt 0 -and $bestMatches.Count -eq 1) {
      $matches = @($bestMatches[0].candidate)
    }
  }

  if ($matches.Count -eq 1) {
    $incomeCandidate = $matches[0]
    $null = $usedCandidateIds.Add($expenseCandidate.id)
    $null = $usedCandidateIds.Add($incomeCandidate.id)
    $memoParts = @($expenseCandidate.memo, $incomeCandidate.memo) | Where-Object { $_ } | Select-Object -Unique
    $normalizedTransfers += [ordered]@{
      type = "transfer"
      date = $expenseCandidate.date
      amount = $expenseCandidate.amount
      fromAccountId = $expenseCandidate.accountId
      fromAccountName = $expenseCandidate.accountName
      toAccountId = $incomeCandidate.accountId
      toAccountName = $incomeCandidate.accountName
      memo = ($memoParts -join " / ")
      source = @(
        [ordered]@{
          sourcePath = $expenseCandidate.sourcePath
          sectionName = $expenseCandidate.sectionName
          lineNumber = $expenseCandidate.lineNumber
        },
        [ordered]@{
          sourcePath = $incomeCandidate.sourcePath
          sectionName = $incomeCandidate.sectionName
          lineNumber = $incomeCandidate.lineNumber
        }
      )
    }
    continue
  }

  $unmatchedTransferCandidates += [ordered]@{
    date = $expenseCandidate.date
    accountId = $expenseCandidate.accountId
    accountName = $expenseCandidate.accountName
    direction = $expenseCandidate.direction
    directionLabel = $expenseCandidate.directionLabel
    amount = $expenseCandidate.amount
    subject = $expenseCandidate.subject
    memo = $expenseCandidate.memo
    reason = if ($matches.Count -gt 1) { "ambiguousCounterpart" } else { "missingCounterpart" }
    source = [ordered]@{
      sourcePath = $expenseCandidate.sourcePath
      sectionName = $expenseCandidate.sectionName
      lineNumber = $expenseCandidate.lineNumber
    }
  }
}

foreach ($incomeCandidate in @($transferCandidates | Where-Object { $_.direction -eq "income" } | Sort-Object date, amount, accountId, lineNumber)) {
  if ($usedCandidateIds.Contains($incomeCandidate.id)) { continue }
  $unmatchedTransferCandidates += [ordered]@{
    date = $incomeCandidate.date
    accountId = $incomeCandidate.accountId
    accountName = $incomeCandidate.accountName
    direction = $incomeCandidate.direction
    directionLabel = $incomeCandidate.directionLabel
    amount = $incomeCandidate.amount
    subject = $incomeCandidate.subject
    memo = $incomeCandidate.memo
    reason = "missingCounterpart"
    source = [ordered]@{
      sourcePath = $incomeCandidate.sourcePath
      sectionName = $incomeCandidate.sectionName
      lineNumber = $incomeCandidate.lineNumber
    }
  }
}

$categoryMappingResults = Build-CategoryMappingResults -NormalTransactions $normalTransactions

$preview = [ordered]@{
  period = [ordered]@{
    fiscalYear = $FiscalYear
    label = "{0}年度" -f $FiscalYear
    startDate = $fiscalRange.startDate
    endDate = $fiscalRange.endDate
    state = "editing"
  }
  sourceFiles = [ordered]@{
    cashCsv = $CashCsv
    depositCsv = $DepositCsv
  }
  accounts = $script:Accounts
  openingBalances = @($openingBalances.GetEnumerator() | Sort-Object Name | ForEach-Object { $_.Value })
  normalizedTransactions = [ordered]@{
    income = @($normalTransactions | Where-Object { $_.type -eq "income" } | Sort-Object date, accountId, amount)
    expense = @($normalTransactions | Where-Object { $_.type -eq "expense" } | Sort-Object date, accountId, amount)
    transfer = @($normalizedTransfers | Sort-Object date, fromAccountId, toAccountId, amount)
  }
  unmatchedTransferCandidates = @($unmatchedTransferCandidates | Sort-Object date, accountId, amount)
  categoryMappingResults = $categoryMappingResults
  skippedRows = @($skippedRows | Sort-Object date, accountId)
  summary = [ordered]@{
    totalRowsRead = $totalRowsRead
    openingBalanceCount = @($openingBalances.Keys).Count
    incomeCount = @($normalTransactions | Where-Object { $_.type -eq "income" }).Count
    expenseCount = @($normalTransactions | Where-Object { $_.type -eq "expense" }).Count
    transferCandidateCount = @($transferCandidates).Count
    transferCount = @($normalizedTransfers).Count
    unmatchedTransferCandidateCount = @($unmatchedTransferCandidates).Count
    unmappedCategoryCount = @($normalTransactions | Where-Object { -not $_.categoryId }).Count
    skippedRowCount = @($skippedRows).Count
    unmappedAccountSectionCount = @($unmappedAccounts | Select-Object -Unique).Count
  }
}

Ensure-Directory $OutJson
Ensure-Directory $OutMarkdown

$preview | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutJson -Encoding UTF8
(Build-MarkdownSummary -Preview $preview) | Set-Content -LiteralPath $OutMarkdown -Encoding UTF8

Write-Output ("JSON: {0}" -f (Resolve-Path -LiteralPath $OutJson))
Write-Output ("Markdown: {0}" -f (Resolve-Path -LiteralPath $OutMarkdown))
Write-Output ($preview.summary | ConvertTo-Json -Depth 4)
