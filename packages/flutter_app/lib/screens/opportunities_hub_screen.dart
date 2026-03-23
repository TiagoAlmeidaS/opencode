import 'package:flutter/material.dart';

import 'market_data_screen.dart';
import 'niches_screen.dart';
import 'opportunities_screen.dart';
import 'reports_screen.dart';

/// Hub screen for the Opportunities tab — sub-tabs: Funnel | Niches | Market | Reports.
class OpportunitiesHubScreen extends StatelessWidget {
  const OpportunitiesHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Column(
        children: [
          TabBar(
            tabs: const [
              Tab(text: 'Funnel'),
              Tab(text: 'Nichos'),
              Tab(text: 'Mercado'),
              Tab(text: 'Relatórios'),
            ],
            labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            unselectedLabelStyle: const TextStyle(fontSize: 13),
            indicatorSize: TabBarIndicatorSize.tab,
          ),
          const Expanded(
            child: TabBarView(
              children: [
                OpportunitiesScreen(),
                NichesScreen(),
                MarketDataScreen(),
                ReportsScreen(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
