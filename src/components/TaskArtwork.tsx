import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const TaskArtwork: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <View style={[styles.scene, compact && styles.compact]}>
    <View style={styles.sky} />
    <View style={styles.hillBack} />
    <View style={styles.hillFront} />
    <View style={[styles.tree, styles.treeLeft]}>
      <View style={styles.trunk} />
      <View style={styles.crown} />
    </View>
    <View style={[styles.tree, styles.treeRight]}>
      <View style={styles.trunk} />
      <View style={styles.crown} />
    </View>
    <View style={styles.grass} />
    <View style={styles.debris}>
      <Ionicons name="leaf" size={compact ? 11 : 16} color="#526B48" />
      <Ionicons name="trash-outline" size={compact ? 12 : 18} color="#32413A" />
      <Ionicons name="bicycle-outline" size={compact ? 11 : 16} color="#486052" />
    </View>
    {!compact && <Text style={styles.caption}>Зелена зона Дніпра</Text>}
  </View>
);

const styles = StyleSheet.create({
  scene: {
    height: 178,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#CBEFF8',
    position: 'relative',
  },
  compact: { height: 92, borderRadius: 12 },
  sky: { ...StyleSheet.absoluteFill, bottom: '48%', backgroundColor: '#BFEAF6' },
  hillBack: {
    position: 'absolute',
    width: '125%',
    height: '52%',
    left: '-12%',
    bottom: '10%',
    borderRadius: 100,
    backgroundColor: '#78D8A5',
  },
  hillFront: {
    position: 'absolute',
    width: '115%',
    height: '36%',
    left: '-7%',
    bottom: '-7%',
    borderRadius: 100,
    backgroundColor: '#4CCB88',
  },
  tree: { position: 'absolute', top: '28%', alignItems: 'center' },
  treeLeft: { left: '22%' },
  treeRight: { right: '21%', top: '22%' },
  trunk: { position: 'absolute', top: 22, width: 5, height: 31, backgroundColor: '#825C3C' },
  crown: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#10A965' },
  grass: {
    position: 'absolute',
    height: 3,
    width: '78%',
    bottom: '19%',
    left: '11%',
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  debris: {
    position: 'absolute',
    left: '37%',
    bottom: '12%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.65)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
  },
  caption: {
    position: 'absolute',
    top: 10,
    left: 11,
    color: '#16573C',
    fontSize: 11,
    fontWeight: '700',
  },
});
