import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';

class MarketDataScreen extends StatefulWidget {
  const MarketDataScreen({super.key});

  @override
  State<MarketDataScreen> createState() => _MarketDataScreenState();
}

class _MarketDataScreenState extends State<MarketDataScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  Timer? _refreshTimer;

  List<Map<String, dynamic>>? _latestData;
  List<Map<String, dynamic>>? _allData;
  List<Map<String, dynamic>>? _signalsData;
  bool _loadingLatest = true;
  bool _loadingAll = true;
  bool _loadingSignals = true;

  Oc2Palette get _palette =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadAll();
    _refreshTimer = Timer.periodic(const Duration(seconds: 60), (_) => _loadAll());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadAll() async {
    _loadLatest();
    _loadMarketData();
    _loadSignals();
  }

  Future<void> _loadLatest() async {
    setState(() => _loadingLatest = true);
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() => _loadingLatest = false);
      return;
    }
    final results = await srv.marketDataLatest();
    if (!mounted) return;
    setState(() {
      _latestData = results;
      _loadingLatest = false;
    });
  }

  Future<void> _loadMarketData() async {
    setState(() => _loadingAll = true);
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() => _loadingAll = false);
      return;
    }
    final results = await srv.marketData(limit: 50);
    if (!mounted) return;
    setState(() {
      _allData = results;
      _loadingAll = false;
    });
  }

  Future<void> _loadSignals() async {
    setState(() => _loadingSignals = true);
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() => _loadingSignals = false);
      return;
    }
    final results = await srv.cryptoSignals(limit: 50);
    if (!mounted) return;
    setState(() {
      _signalsData = results;
      _loadingSignals = false;
    });
  }

  Color _assetTypeColor(String? type) {
    switch (type) {
      case 'crypto':
        return Colors.blue;
      case 'stock':
        return Colors.green;
      case 'etf':
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }

  String _assetTypeInitial(String? type) {
    switch (type) {
      case 'crypto':
        return 'C';
      case 'stock':
        return 'S';
      case 'etf':
        return 'E';
      default:
        return '?';
    }
  }

  String _formatNumber(num? value) {
    if (value == null) return '-';
    final abs = value.abs();
    if (abs >= 1e12) return '${(value / 1e12).toStringAsFixed(2)}T';
    if (abs >= 1e9) return '${(value / 1e9).toStringAsFixed(2)}B';
    if (abs >= 1e6) return '${(value / 1e6).toStringAsFixed(2)}M';
    if (abs >= 1e3) return '${(value / 1e3).toStringAsFixed(2)}K';
    return value.toStringAsFixed(2);
  }

  String _formatPrice(num? price, String? currency) {
    if (price == null) return '-';
    final cur = currency ?? 'USD';
    final symbol = cur == 'USD' ? '\$' : cur == 'EUR' ? '€' : '$cur ';
    if (price >= 1000) return '$symbol${price.toStringAsFixed(0)}';
    if (price >= 1) return '$symbol${price.toStringAsFixed(2)}';
    return '$symbol${price.toStringAsFixed(6)}';
  }

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        backgroundColor: palette.backgroundBase,
        appBar: AppBar(
          backgroundColor: palette.backgroundBase,
          foregroundColor: palette.textStrong,
          title: const Text('Market Data'),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh),
              tooltip: 'Refresh',
              onPressed: _loadAll,
            ),
          ],
          bottom: TabBar(
            controller: _tabController,
            labelColor: palette.textStrong,
            unselectedLabelColor: palette.textWeak,
            indicatorColor: palette.textStrong,
            tabs: const [
              Tab(text: 'Latest'),
              Tab(text: 'All'),
              Tab(text: 'Análise'),
            ],
          ),
        ),
        body: TabBarView(
          controller: _tabController,
          children: [
            _buildList(palette, _latestData, _loadingLatest),
            _buildList(palette, _allData, _loadingAll),
            _buildSignals(palette),
          ],
        ),
      ),
    );
  }

  Widget _buildList(
    Oc2Palette palette,
    List<Map<String, dynamic>>? data,
    bool loading,
  ) {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (data == null || data.isEmpty) {
      return Center(
        child: Text('No data available', style: TextStyle(color: palette.textWeak)),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: data.length,
      itemBuilder: (ctx, i) => _buildItem(palette, data[i]),
    );
  }

  Widget _buildItem(Oc2Palette palette, Map<String, dynamic> item) {
    final symbol = item['symbol'] as String? ?? '-';
    final name = item['name'] as String?;
    final price = item['price'] as num?;
    final changePct = item['change_pct'] as num?;
    final volume = item['volume'] as num?;
    final marketCap = item['market_cap'] as num?;
    final assetType = item['asset_type'] as String?;
    final currency = item['currency'] as String?;

    final isPositive = (changePct ?? 0) >= 0;
    final changeColor = isPositive ? Colors.green : Colors.red;
    final changeArrow = isPositive ? '▲' : '▼';
    final changePctStr = changePct != null
        ? '$changeArrow${isPositive ? '+' : ''}${changePct.toStringAsFixed(2)}%'
        : '-';

    final typeColor = _assetTypeColor(assetType);
    final typeInitial = _assetTypeInitial(assetType);

    final subtitleParts = <String>[];
    if (volume != null) subtitleParts.add('Vol: ${_formatNumber(volume)}');
    if (marketCap != null) subtitleParts.add('MCap: ${_formatNumber(marketCap)}');

    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        dense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        leading: CircleAvatar(
          radius: 18,
          backgroundColor: typeColor.withValues(alpha: 0.15),
          child: Text(
            typeInitial,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: typeColor,
            ),
          ),
        ),
        title: Row(
          children: [
            Text(
              symbol,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 13,
                color: palette.textStrong,
              ),
            ),
            if (name != null) ...[
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  name,
                  style: TextStyle(fontSize: 11, color: palette.textWeak),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ],
        ),
        subtitle: subtitleParts.isNotEmpty
            ? Text(
                subtitleParts.join('  '),
                style: TextStyle(fontSize: 11, color: palette.textWeak),
              )
            : null,
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              _formatPrice(price, currency),
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: palette.textStrong,
              ),
            ),
            Text(
              changePctStr,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: changeColor,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Análise tab ────────────────────────────────────────────────────────────

  Widget _buildSignals(Oc2Palette palette) {
    if (_loadingSignals) return const Center(child: CircularProgressIndicator());
    final data = _signalsData;
    if (data == null || data.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.analytics_outlined, size: 48, color: palette.iconBase),
            const SizedBox(height: 12),
            Text(
              'Nenhuma análise técnica disponível.\nExecute a pipeline "Crypto Analysis Daily" para gerar sinais.',
              textAlign: TextAlign.center,
              style: TextStyle(color: palette.textWeak),
            ),
          ],
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: data.length,
      itemBuilder: (ctx, i) => _buildSignalCard(palette, data[i]),
    );
  }

  Widget _buildSignalCard(Oc2Palette palette, Map<String, dynamic> item) {
    final symbol = (item['symbol'] as String? ?? '-').toUpperCase();
    final signal = item['signal'] as String? ?? 'hold';
    final trend = item['trend'] as String? ?? 'neutral';
    final price = item['price'] as num?;
    final change24h = item['change_24h'] as num?;
    final rsi14 = item['rsi_14'] as num?;
    final macd = item['macd'] as num?;
    final macdSignal = item['macd_signal'] as num?;
    final sma7 = item['sma_7'] as num?;
    final sma21 = item['sma_21'] as num?;
    final strength = item['signal_strength'] as num?;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showSignalDetail(item),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    symbol,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                      color: palette.textStrong,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _SignalBadge(signal: signal),
                  const SizedBox(width: 6),
                  _TrendBadge(trend: trend),
                  const Spacer(),
                  if (price != null)
                    Text(
                      _formatPrice(price, 'USD'),
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                        color: palette.textStrong,
                      ),
                    ),
                  if (change24h != null) ...[
                    const SizedBox(width: 6),
                    Text(
                      '${change24h >= 0 ? '+' : ''}${change24h.toStringAsFixed(2)}%',
                      style: TextStyle(
                        fontSize: 11,
                        color: change24h >= 0 ? Colors.green : Colors.red,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              // Indicators row
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  if (rsi14 != null) _IndicatorChip(label: 'RSI', value: rsi14.toStringAsFixed(1), color: _rsiColor(rsi14.toDouble())),
                  if (macd != null && macdSignal != null)
                    _IndicatorChip(
                      label: 'MACD',
                      value: macd > macdSignal ? 'Bull' : 'Bear',
                      color: macd > macdSignal ? Colors.green : Colors.red,
                    ),
                  if (sma7 != null && sma21 != null && price != null)
                    _IndicatorChip(
                      label: 'SMA',
                      value: sma7 > sma21 ? '7>21' : '7<21',
                      color: sma7 > sma21 ? Colors.green : Colors.orange,
                    ),
                  if (strength != null)
                    _IndicatorChip(
                      label: 'Conf',
                      value: '${(strength * 100).toStringAsFixed(0)}%',
                      color: Colors.blueGrey,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _rsiColor(double rsi) {
    if (rsi < 30) return Colors.green;
    if (rsi > 70) return Colors.red;
    return Colors.orange;
  }

  void _showSignalDetail(Map<String, dynamic> item) {
    final symbol = (item['symbol'] as String? ?? '-').toUpperCase();
    final recommendation = item['recommendation'] as String? ?? item['reasoning'] as String? ?? 'Sem análise disponível.';
    final rsi14 = item['rsi_14'] as num?;
    final sma7 = item['sma_7'] as num?;
    final sma21 = item['sma_21'] as num?;
    final sma50 = item['sma_50'] as num?;
    final bbUpper = item['bb_upper'] as num?;
    final bbLower = item['bb_lower'] as num?;
    final bbMiddle = item['bb_middle'] as num?;
    final macd = item['macd'] as num?;
    final macdSignal = item['macd_signal'] as num?;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        final palette = Theme.of(ctx).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.65,
          maxChildSize: 0.9,
          builder: (_, scroll) => Container(
            decoration: BoxDecoration(
              color: palette.backgroundBase,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: ListView(
              controller: scroll,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: palette.borderWeak,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Text(
                  symbol,
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: palette.textStrong),
                ),
                const SizedBox(height: 12),
                // Indicators table
                _detailRow('RSI(14)', rsi14 != null ? rsi14.toStringAsFixed(2) : '-', palette),
                _detailRow('SMA 7', sma7 != null ? '\$${sma7.toStringAsFixed(4)}' : '-', palette),
                _detailRow('SMA 21', sma21 != null ? '\$${sma21.toStringAsFixed(4)}' : '-', palette),
                _detailRow('SMA 50', sma50 != null ? '\$${sma50.toStringAsFixed(4)}' : '-', palette),
                _detailRow('MACD', macd != null ? macd.toStringAsFixed(6) : '-', palette),
                _detailRow('MACD Signal', macdSignal != null ? macdSignal.toStringAsFixed(6) : '-', palette),
                _detailRow('BB Upper', bbUpper != null ? '\$${bbUpper.toStringAsFixed(4)}' : '-', palette),
                _detailRow('BB Middle', bbMiddle != null ? '\$${bbMiddle.toStringAsFixed(4)}' : '-', palette),
                _detailRow('BB Lower', bbLower != null ? '\$${bbLower.toStringAsFixed(4)}' : '-', palette),
                const SizedBox(height: 16),
                Text(
                  'Análise LLM',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: palette.textStrong),
                ),
                const SizedBox(height: 8),
                SelectableText(
                  recommendation,
                  style: TextStyle(fontSize: 13, color: palette.textBase, height: 1.5),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _detailRow(String label, String value, Oc2Palette palette) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: TextStyle(fontSize: 12, color: palette.textWeak)),
          ),
          Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: palette.textStrong)),
        ],
      ),
    );
  }
}

// ─── Badges & chips ──────────────────────────────────────────────────────────

class _SignalBadge extends StatelessWidget {
  const _SignalBadge({required this.signal});
  final String signal;

  @override
  Widget build(BuildContext context) {
    final color = switch (signal) {
      'buy' => Colors.green,
      'sell' => Colors.red,
      _ => Colors.orange,
    };
    final label = signal.toUpperCase();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: color),
      ),
    );
  }
}

class _TrendBadge extends StatelessWidget {
  const _TrendBadge({required this.trend});
  final String trend;

  @override
  Widget build(BuildContext context) {
    final color = switch (trend) {
      'bullish' => Colors.green,
      'bearish' => Colors.red,
      _ => Colors.blueGrey,
    };
    final icon = switch (trend) {
      'bullish' => Icons.trending_up,
      'bearish' => Icons.trending_down,
      _ => Icons.trending_flat,
    };
    return Icon(icon, size: 16, color: color);
  }
}

class _IndicatorChip extends StatelessWidget {
  const _IndicatorChip({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        '$label: $value',
        style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w500),
      ),
    );
  }
}
