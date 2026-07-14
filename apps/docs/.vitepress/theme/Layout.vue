<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import { useData } from 'vitepress';
import HomePage from './HomePage.vue';

const { frontmatter } = useData();
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-before>
      <HomePage v-if="frontmatter.sovereignHome" />
    </template>
  </DefaultTheme.Layout>
</template>
