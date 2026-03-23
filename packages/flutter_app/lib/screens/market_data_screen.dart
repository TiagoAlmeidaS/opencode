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
  bool _loadingLatest = true;
  bool _loadingAll = true;

  Oc2Palette get _palette =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
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
      length: 2,
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
            ],
          ),
        ),
        body: TabBarView(
          controller: _tabController,
          children: [
            _buildList(palette, _latestData, _loadingLatest),
            _buildList(palette, _allData, _loadingAll),
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
}
